<template>
  <div class="upload-file">
    <n-upload @before-upload="onUpload">
      <n-button>上传文件</n-button>
    </n-upload>
    <div class="percentage">
      <div>
        <span>上传进度：</span>
        <n-progress type="line" :percentage="progress" />
      </div>
    </div>
    <div class="actions">
      <!-- <n-button v-if="isPause" type="primary" @click="onResume">继续</n-button>
      <n-button v-else type="default" @click="onPause">暂停</n-button> -->
      <n-button type="default" @click="onPause">暂停</n-button>
      <n-button type="primary" @click="onResume">继续</n-button>
    </div>

    <div class="chunk-list">
      <h3>分片上传列表</h3>
      <ChunkDetail
        :list="chunks"
      ></ChunkDetail>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NUpload, NButton, useMessage, NProgress } from "naive-ui";
import type { UploadFileInfo } from "naive-ui";
import { useBigFileUpload } from "@/hooks/useBigFileUpload";
import ChunkDetail from "./ChunkDetail.vue";
import { computed } from "vue";

const {
  percentage,
  startUpload,
  pauseUpload,
  resumeUpload,
  chunks
} = useBigFileUpload();
const message = useMessage();

const progress = computed(() => {
  return parseFloat(percentage.value.toFixed(2))
})

const onUpload = (data: {
  file: UploadFileInfo;
  fileList: Array<UploadFileInfo>;
  event?: Event;
}) => {
  console.log(data);
  const file = data.file.file;
  if (!file) {
    message.error("请选择文件!");
    return;
  }
  startUpload(file);
};

const onPause = () => {
  pauseUpload();
};

const onResume = () => {
  resumeUpload();
};

</script>

<style scoped>
.upload-file {
  width: 800px;
}
.actions {
  display: flex;
  gap: 10px;
}

.chunk-list {
  height: 600px;
  overflow-y: auto;
}
</style>
