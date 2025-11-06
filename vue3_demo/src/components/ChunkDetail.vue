<template>
  <div class="chunk">
      <n-table :bordered="false" :single-line="false">
        <thead>
          <tr>
            <th>索引</th>
            <th>名称</th>
            <th>分片大小(byte)</th>
            <th>请求总进度(byte)</th>
            <th>已上传(byte)</th>
            <th>上传进度</th>
            <th>是否完成</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="data in list" :key="data.name">
            <td>{{ data.index }}</td>
            <td>{{ data.name }}</td>
            <td>{{ data.size}}</td>
            <td>{{ data.requestSize }}</td>
            <td>{{ data.uploaded }}</td>
            <td>{{ getProgress(data) }}%</td>
            <td>{{ data.completed }}</td>
          </tr>
        </tbody>
      </n-table>
    </div>
</template>

<script setup lang="ts">
import { NTable } from "naive-ui";
import type { Chunk } from "@/hooks/useBigFileUpload";

defineProps<{
  list: Chunk[];
}>();

const getProgress = (data: Chunk) => {
  const progress = data.requestSize ? (data.uploaded / data.requestSize) * 100 : 0;
  return progress.toFixed(2);
};
</script>

<style scoped>

</style>