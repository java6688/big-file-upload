<template>
  <div class="upload-file">
    <n-upload @before-upload="onUpload">
      <n-button>上传文件</n-button>
    </n-upload>
    <div class="percentage section">
      <div>
        <span>上传进度：</span>
        <n-progress type="line" :percentage="progress" />
      </div>
    </div>
    <div class="state section">
      <span>当前状态：</span>
      <n-tag v-if="state === UploadStatus.Uploading" type="info">上传中</n-tag>
      <n-tag v-else-if="state === UploadStatus.Pause" type="warning">暂停</n-tag>
      <n-tag v-else-if="state === UploadStatus.Completed" type="success">完成</n-tag>
      <n-tag v-else>等待上传</n-tag>
    </div>
    <div class="actions section">
      <span>操作：</span>
      <n-button type="default" @click="onPause" v-if="state === UploadStatus.Uploading">暂停</n-button>
      <n-button type="primary" @click="onResume" v-if="state === UploadStatus.Pause">继续</n-button>
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
import { NUpload, NButton, useMessage, NProgress, NTag } from "naive-ui";
import type { UploadFileInfo } from "naive-ui";
import { useBigFileUpload, UploadStatus } from "@/hooks/useBigFileUpload";
import ChunkDetail from "./ChunkDetail.vue";
import { computed } from "vue";

const {
  percentage,
  startUpload,
  pauseUpload,
  resumeUpload,
  chunks,
  state
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
  align-items: center;
  gap: 10px;
}

.chunk-list {
  height: 600px;
  overflow-y: auto;
}
.section {
  margin-top: 20px;
}
</style>
