<template>
  <div class="redeem-page">
    <div class="card">
      <h1 class="title">请输入兑换码跳转 Claude 网页版</h1>
      <p class="subtitle">仅需输入兑换码进行验证，成功后将跳转到 Claude 网页端。</p>

      <form class="form" @submit.prevent="onSubmit">
        <input
          v-model.trim="code"
          class="input"
          :disabled="submitting"
          placeholder="请输入兑换码"
          type="text"
          @keyup.enter="onSubmit"
        />
        <button class="button" :disabled="!code || submitting" type="submit">
          {{ submitting ? '验证中...' : '验证' }}
        </button>
      </form>

      <p v-if="message" :class="['message', success ? 'success' : 'error']">{{ message }}</p>

      <div v-if="success && targetUrl" class="actions">
        <a class="link-button" :href="targetUrl" rel="noopener" target="_blank"
          >前往 Claude 网页版</a
        >
      </div>

      <p class="hint">
        若已获得兑换码，输入后将跳转到
        <a href="https://free.yourapi.cn/" rel="noopener" target="_blank">Claude 网页版</a>。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'

const { post } = useApi()

const code = ref('')
const submitting = ref(false)
const message = ref('')
const success = ref(false)
const targetUrl = ref('')

async function onSubmit() {
  if (!code.value || submitting.value) return
  submitting.value = true
  message.value = ''
  success.value = false

  try {
    const res = await post('/redeem', { code: code.value }, { showError: false })
    // 统一解析
    const body = res?.data || {}
    if (body.success) {
      success.value = true
      message.value = body.message || '验证成功'
      targetUrl.value = body.targetUrl || body.data?.targetUrl || 'https://free.yourapi.cn/'
      // 礼花特效
      launchConfetti()
      return
    }
    // 非标准成功兜底
    success.value = true
    message.value = body.message || '验证成功'
    targetUrl.value = body.targetUrl || body.data?.targetUrl || 'https://free.yourapi.cn/'
    launchConfetti()
  } catch (err) {
    success.value = false
    message.value = (err && err.message) || '验证失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

async function launchConfetti() {
  try {
    const mod = await import(
      'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.module.mjs'
    )
    const confetti = mod.default
    const defaults = { origin: { y: 0.6 } }
    const fire = (particleRatio, opts) => {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(200 * particleRatio)
      })
    }
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  } catch (e) {
    // 静默失败，不影响主流程
  }
}
</script>

<style scoped>
.redeem-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1220;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 520px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
  color: #e2e8f0;
}

.subtitle {
  margin: 0 0 20px;
  font-size: 14px;
  color: #94a3b8;
}

.form {
  display: flex;
  gap: 12px;
}

.input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: #0b1220;
  color: #e2e8f0;
  outline: none;
}
.input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.button {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.message {
  margin-top: 14px;
  font-size: 14px;
}
.message.success {
  color: #34d399;
}
.message.error {
  color: #f87171;
}

.actions {
  margin-top: 12px;
}
.link-button {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 8px;
  background: #10b981;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}
.link-button:hover {
  filter: brightness(1.05);
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}
.hint a {
  color: #60a5fa;
}
</style>
