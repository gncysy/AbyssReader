<template>
  <Teleport to="body">
    <div v-if="visible" v-no-drag class="photo-overlay" @click="close">
      <img :src="src" class="photo-img" @click.stop />
      <button class="photo-close" @click="close">✕</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const visible = ref(false)
const src = ref('')
function open(imgSrc: string): void { src.value = imgSrc; visible.value = true }
function close(): void { visible.value = false }
defineExpose({ open, close })
</script>

<style scoped>
.photo-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; }
.photo-img { max-width: 90vw; max-height: 90vh; object-fit: contain; cursor: default; }
.photo-close { position: absolute; top: 20px; right: 20px; background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.2s; }
.photo-close:hover { background: rgba(255,255,255,0.15); }
</style>
