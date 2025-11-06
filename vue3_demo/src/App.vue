<template>
  <n-message-provider>
    <div class="app">
      <BigFileUpload />
    </div>
  </n-message-provider>
</template>

<script setup lang="ts">
import { NMessageProvider } from "naive-ui";
import BigFileUpload from './components/BigFileUpload.vue';

</script>

<style scoped>
.app {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}
</style>
