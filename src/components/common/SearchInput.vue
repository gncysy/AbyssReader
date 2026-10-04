<template>
  <input
    :id="name"
    :value="modelValue"
    type="text"
    :name="name"
    :placeholder="placeholder"
    class="input-search"
    autocomplete="off"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @keydown.enter="$emit('search')"
  />
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue: string; placeholder?: string; name?: string }>(), { name: 'search-input' })
defineEmits<{ 'update:modelValue': [value: string]; search: [] }>()
</script>
