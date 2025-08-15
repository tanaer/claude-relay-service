# 兑换码动态计费策略数据结构设计

## 核心需求回顾
- 分层策略系统：全局默认 → 兑换码类型 → 个别兑换码
- 基于Token数量的使用量计算
- 定时监控（每5分钟检查）
- 策略触发后立即生效
- 每天0点重置
- 仅记录日志，不主动通知

## Redis 数据结构设计

### 1. 策略配置存储

#### 1.1 全局默认策略
```
key: redemption_policy:global:default
type: Hash
fields:
{
  "enabled": "true",
  "initialRateTemplate": "default_template_id",
  "initialAccountGroup": "default_group_id",
  "thresholds": JSON.stringify([
    { "percentage": 50, "templateId": "limit_template_50", "priority": 1 },
    { "percentage": 80, "templateId": "limit_template_80", "priority": 2 }
  ]),
  "resetHour": "0",  // 重置时间（小时）
  "monitorInterval": "5",  // 监控间隔（分钟）
  "createdAt": "ISO_DATE",
  "updatedAt": "ISO_DATE"
}
```

#### 1.2 兑换码类型策略
```
key: redemption_policy:type:{type}  // type: daily, monthly, custom等
type: Hash
fields:
{
  "enabled": "true",
  "inheritGlobal": "true",  // 是否继承全局策略
  "initialRateTemplate": "type_specific_template_id",
  "initialAccountGroup": "type_specific_group_id",
  "thresholds": JSON.stringify([...]),
  "resetHour": "0",
  "description": "日卡专用策略",
  "createdAt": "ISO_DATE",
  "updatedAt": "ISO_DATE"
}
```

#### 1.3 个别兑换码策略
```
key: redemption_policy:code:{codeId}
type: Hash
fields:
{
  "enabled": "true",
  "inheritType": "true",  // 是否继承类型策略
  "customPolicy": JSON.stringify({
    "initialRateTemplate": "custom_template_id",
    "initialAccountGroup": "custom_group_id",
    "thresholds": [...],
    "description": "特殊兑换码策略"
  }),
  "createdAt": "ISO_DATE",
  "updatedAt": "ISO_DATE"
}
```

### 2. 策略执行状态存储

#### 2.1 API Key 策略绑定状态
```
key: api_key_policy:{apiKeyId}
type: Hash
fields:
{
  "sourceType": "redemption",  // 来源类型
  "sourceId": "code_id_or_type",  // 来源ID
  "currentTemplate": "current_template_id",
  "initialTemplate": "initial_template_id",
  "appliedThresholds": JSON.stringify([]),  // 已应用的阈值
  "lastCheck": "ISO_DATE",
  "lastReset": "ISO_DATE",
  "isActive": "true",
  "metadata": JSON.stringify({
    "redemptionDate": "ISO_DATE",
    "codeType": "daily",
    "originalCode": "CODE123"
  })
}
```

#### 2.2 使用量监控数据
```
key: usage_monitor:{apiKeyId}:{date}  // date: YYYY-MM-DD
type: Hash
fields:
{
  "totalTokens": "0",
  "inputTokens": "0",
  "outputTokens": "0",
  "cacheReadTokens": "0",
  "cacheCreateTokens": "0",
  "requestCount": "0",
  "lastUpdate": "ISO_DATE",
  "dailyLimit": "1000000",  // 每日Token限额
  "currentPercentage": "0.0",
  "thresholdHistory": JSON.stringify([
    { "percentage": 50, "triggeredAt": "ISO_DATE", "templateSwitched": "template_id" }
  ])
}
```

### 3. 策略执行队列

#### 3.1 待处理策略检查队列
```
key: policy_check_queue
type: Sorted Set
score: timestamp (下次检查时间)
member: apiKeyId
```

#### 3.2 每日重置队列
```
key: daily_reset_queue:{date}
type: Set
members: [apiKeyId1, apiKeyId2, ...]
```

### 4. 索引和查询优化

#### 4.1 活跃策略索引
```
key: active_policies:redemption
type: Set
members: [apiKeyId1, apiKeyId2, ...]
```

#### 4.2 类型到API Key映射
```
key: policy_type_index:{type}
type: Set
members: [apiKeyId1, apiKeyId2, ...]
```

#### 4.3 模板切换历史
```
key: template_switch_history:{apiKeyId}
type: List
elements: JSON.stringify([
  {
    "fromTemplate": "template_1",
    "toTemplate": "template_2",
    "reason": "threshold_50_exceeded",
    "triggeredAt": "ISO_DATE",
    "usagePercentage": 52.3
  }
])
```

## 数据生命周期管理

### 清理策略
1. **使用量监控数据**: 保留30天
2. **模板切换历史**: 保留90天  
3. **策略执行状态**: 与API Key生命周期一致
4. **策略配置**: 永久保留，支持版本管理

### 数据一致性
1. **原子操作**: 使用Redis事务确保策略切换的原子性
2. **数据同步**: 策略配置变更时自动更新相关索引
3. **故障恢复**: 支持从策略执行状态重建监控队列

## 性能优化考虑

### 查询优化
1. **批量查询**: 使用pipeline减少网络往返
2. **索引利用**: 通过类型索引快速定位相关API Key
3. **缓存策略**: 热点策略配置缓存到内存

### 存储优化
1. **数据压缩**: JSON数据使用压缩存储
2. **分片策略**: 大量数据按日期或用户ID分片
3. **过期机制**: 自动清理过期的监控数据

## 扩展性设计

### 策略类型扩展
- 支持新的策略类型（如：周卡、年卡）
- 支持复杂的条件规则（时间段、用户类型等）

### 监控指标扩展
- 支持基于成本、请求次数的监控
- 支持自定义监控指标

### 通知系统预留
- 预留通知配置字段
- 支持多种通知方式（邮件、Webhook等）