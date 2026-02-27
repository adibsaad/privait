// Web
export interface JWTPayload {
  id: number
}

// Worker Jobs
export interface HelloJob {
  type: 'hello-job'
}

export type JobType = HelloJob
