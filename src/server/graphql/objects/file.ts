export class FileUpload {
  constructor(
    public id: number,
    public originalName: string,
    public fileName: string,
    public mimeType: string,
    public size: number,
    public type: 'PDF' | 'TEXT',
    public s3Key: string,
    public s3Url: string,
  ) {}
}

export class FileUploadPayload {
  constructor(public fileUpload: FileUpload) {}
}
