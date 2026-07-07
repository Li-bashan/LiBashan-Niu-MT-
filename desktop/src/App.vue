<template>
  <main class="widget-shell">
    <section class="hud-panel">
      <header class="widget-header">
        <h1>LiBashan Niu MT</h1>
        <div class="status-row">
          <span class="online-dot" :style="{ backgroundColor: accent, boxShadow: `0 0 16px ${accent}` }"></span>
          <span>{{ updatedLabel }}</span>
          <span class="bluetooth">Bluetooth</span>
        </div>
      </header>

      <section class="range-card glass-card">
        <div class="range-copy">
          <span class="card-label">Range</span>
          <strong>{{ rangeText }}</strong>
          <span class="unit">km</span>
        </div>

        <div class="battery-gauge" :style="{ '--battery': batteryNumber, '--accent': accent }">
          <div class="gauge-ring"></div>
          <div class="gauge-core">
            <strong :class="{ compact: batteryNumber >= 100 }">{{ batteryText }}<span>%</span></strong>
            <small>Battery</small>
          </div>
        </div>
      </section>

      <section class="metric-grid">
        <div class="metric-tile glass-card">
          <div class="tile-icon charge-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path v-if="isFull" d="M20 6 9 17l-5-5" />
              <path v-else d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z" />
            </svg>
          </div>
          <div>
            <strong>{{ chargingLabel }}</strong>
            <small>Status</small>
          </div>
        </div>

        <div class="metric-tile glass-card">
          <div class="tile-icon time-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5l3.4 2" />
            </svg>
          </div>
          <div>
            <strong>{{ fullInText }}</strong>
            <small>{{ fullInLabel }}</small>
          </div>
        </div>
      </section>

      <section class="location-card glass-card">
        <div class="location-head">
          <span>Location</span>
          <time>{{ locationAgeText }}</time>
        </div>
        <strong :title="locationText">{{ locationText }}</strong>
      </section>
    </section>

    <section class="model-panel" aria-hidden="true">
      <div class="static-hero">
        <img :src="heroSrc" alt="" />
      </div>
      <div class="hero-vignette"></div>
      <div class="floor-glow"></div>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const STATE_URL = import.meta.env.VITE_NIU_STATE_URL || 'http://127.0.0.1:8787/state'
const heroSrc = `${import.meta.env.BASE_URL}assets/niu_mt_background.jpg`
const state = ref({})
const offline = ref(false)
let timer = 0

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function text(value, fallback = '--') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function cleanLocation(value) {
  return text(value).replace(/[\\"]+$/g, '').trim()
}

function updatedText(value) {
  if (!value) return 'Updated --:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return `Updated ${value}`
  return `Updated ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

async function refreshState() {
  try {
    const response = await fetch(STATE_URL, { cache: 'no-store' })
    state.value = await response.json()
    offline.value = false
  } catch {
    offline.value = true
  }
}

const batteryNumber = computed(() => Math.max(0, Math.min(100, asNumber(state.value.battery) ?? 0)))
const batteryText = computed(() => text(asNumber(state.value.battery), '--'))
const rangeText = computed(() => text(asNumber(state.value.rangeKm), '--'))
const isFull = computed(() => batteryNumber.value >= 100)
const fullInText = computed(() => (isFull.value ? 'Full' : text(state.value.fullIn)))
const fullInLabel = computed(() => (isFull.value ? 'Charged' : 'Full in'))
const locationText = computed(() => cleanLocation(state.value.location))
const locationAgeText = computed(() => text(state.value.locationAge))
const updatedLabel = computed(() => (offline.value ? 'Cloud offline' : updatedText(state.value.updatedAt)))

const accent = computed(() => {
  const battery = asNumber(state.value.battery)
  if (offline.value) return '#ff5c4d'
  if (battery !== null && battery >= 100) return '#31e982'
  if (state.value.charging === true) return '#31e982'
  if (battery !== null && battery < 30) return '#ff5c4d'
  if (battery !== null && battery < 50) return '#ffcf5a'
  return '#31e982'
})

const chargingLabel = computed(() => {
  const battery = asNumber(state.value.battery)
  if (offline.value) return 'Offline'
  if (battery !== null && battery >= 100) return 'Full'
  if (state.value.charging === true) return 'Charging'
  if (battery !== null && battery < 30) return 'Charge'
  if (battery !== null && battery < 50) return 'Low'
  return 'Ready'
})

onMounted(() => {
  refreshState()
  timer = window.setInterval(refreshState, 30000)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
})
</script>
