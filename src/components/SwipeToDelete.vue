<script setup>
import { ref } from 'vue'
import { playSound } from '../utils/sound'

const props = defineProps({ id: { type: [String, Number], required: true } })
const emit = defineEmits(['delete'])

const startX = ref(0)
const currentX = ref(0)
const isSwiping = ref(false)

function onStart(e) {
  startX.value = e.touches ? e.touches[0].clientX : e.clientX
  isSwiping.value = true
  currentX.value = 0
}

function onMove(e) {
  if (!isSwiping.value) return
  const x = e.touches ? e.touches[0].clientX : e.clientX
  const diff = startX.value - x
  if (diff > 0) currentX.value = diff
}

function onEnd() {
  if (!isSwiping.value) return
  isSwiping.value = false
  
  if (currentX.value > 70) {
    playSound('delete')
    currentX.value = 0
    emit('delete', props.id)
  } else {
    currentX.value = 0
  }
}
</script>

<template>
  <div class="relative overflow-hidden w-full group touch-pan-y border-b border-slate-100 last:border-0">
    <!-- Background Red Delete Layer -->
    <div class="absolute inset-0 bg-red-500 flex items-center justify-end pr-4 text-white z-0">
      <span class="text-[18px]">🗑️ ডিলিট</span>
    </div>

    <!-- Swipeable Content -->
    <div 
      class="relative z-10 transition-transform duration-200 ease-out bg-white"
      :style="{ 
        transform: `translateX(-${currentX}px)`,
        transitionDuration: isSwiping ? '0ms' : '250ms',
        opacity: currentX > 70 ? 0.5 : 1
      }"
      @touchstart="onStart"
      @touchmove.prevent="onMove"
      @touchend="onEnd"
      @mousedown="onStart"
      @mousemove="onMove"
      @mouseup="onEnd"
      @mouseleave="onEnd"
    >
      <slot></slot>
    </div>

    <!-- Desktop Hover X Icon -->
    <div class="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex bg-white">
      <button 
        @click="playSound('delete'); emit('delete', id);" 
        class="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-sm font-bold active:scale-90"
      >
        ✕
      </button>
    </div>
  </div>
</template>