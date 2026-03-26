import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

@Injectable()
export class MediaService {
  private readonly s3: S3Client | null;

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<boolean>('ENABLE_R2') === true;
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    if (enabled && accountId) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID') ?? '',
          secretAccessKey:
            this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '',
        },
      });
    } else {
      this.s3 = null;
    }
  }

  async getUploadUrl(
    userId: string,
    fileName: string,
    fileType: string,
    context: string,
  ): Promise<{
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresIn: number;
  }> {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
    const key = `${context}/${userId}/${nanoid(12)}.${ext}`;
    const bucket =
      this.config.get<string>('R2_BUCKET_NAME') ?? 'hephaistos-media';
    const publicBase = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );

    if (!this.s3) {
      return {
        uploadUrl: `https://mock.local/upload?key=${encodeURIComponent(key)}`,
        publicUrl: publicBase
          ? `${publicBase}/${key}`
          : `https://mock.local/${key}`,
        key,
        expiresIn: 600,
      };
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 });
    const publicUrl = publicBase ? `${publicBase}/${key}` : uploadUrl;

    return { uploadUrl, publicUrl, key, expiresIn: 600 };
  }
}
