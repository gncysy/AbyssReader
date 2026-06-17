<template>
  <div class="app min-h-screen bg-parchment dark:bg-ink transition-colors duration-500">
    <div class="flex h-screen">
      <nav class="w-56 border-r border-ink-border/15 dark:border-ink-border flex flex-col py-8 px-6 bg-ink-light/30 dark:bg-ink-light/20">
        <div class="mb-12">
          <h1 class="font-display text-2xl font-bold text-amber tracking-wider">
            墨<span class="text-parchment-muted/70">阅</span>
          </h1>
          <p class="text-[10px] text-parchment-muted/50 tracking-[0.15em] uppercase mt-1">AbyssReader</p>
        </div>
        <div class="flex flex-col gap-6">
          <button
            v-for="item in navItems"
            :key="item.page"
            @click="currentPage = item.page"
            :class="[
              'text-left text-sm tracking-wider transition-all duration-300 flex items-center gap-3 group',
              currentPage === item.page
                ? 'text-amber font-medium'
                : 'text-parchment-muted/60 hover:text-parchment-muted'
            ]"
          >
            <span class="text-[10px] opacity-40 group-hover:opacity-60 transition-opacity">{{ item.number }}</span>
            <span>{{ item.label }}</span>
            <span v-if="currentPage === item.page" class="ml-auto w-1 h-1 bg-amber rounded-full"></span>
          </button>
        </div>
        <div class="mt-auto pt-8 border-t border-ink-border/20 dark:border-ink-border/30">
          <p class="text-[10px] text-parchment-muted/40 tracking-wider">v0.1.0</p>
        </div>
      </nav>
      <main class="flex-1 overflow-y-auto">
        <SearchPage v-if="currentPage === 'search'" />
        <BookshelfPage v-if="currentPage === 'bookshelf'" />
        <ExplorePage v-if="currentPage === 'explore'" />
        <SourceManagerPage v-if="currentPage === 'sources'" />
        <SettingsPage v-if="currentPage === 'settings'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SearchPage from './pages/Search.vue'
import BookshelfPage from './pages/Bookshelf.vue'
import ExplorePage from './pages/Explore.vue'
import SourceManagerPage from './pages/SourceManager.vue'
import SettingsPage from './pages/Settings.vue'

const currentPage = ref('bookshelf')

const navItems = [
  { page: 'bookshelf', label: '书架', number: '01' },
  { page: 'search', label: '搜索', number: '02' },
  { page: 'explore', label: '发现', number: '03' },
  { page: 'sources', label: '书源', number: '04' },
  { page: 'settings', label: '设置', number: '05' },
]
</script>
