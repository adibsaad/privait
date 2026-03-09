// Web
export interface JWTPayload {
  id: number
}

// Worker Jobs
export interface HelloJob {
  type: 'hello-job'
}

export interface ProcessFileJob {
  type: 'process-file'
  data: {
    fileUploadId: number
  }
}

export type JobType = HelloJob | ProcessFileJob
