/**
 * Secret Manager secret for TomoriBot runtime configuration.
 *
 * This secret holds a JSON blob with the same keys as the AWS Secrets Manager
 * secret (tomoribot/production), minus AWS/Matrix/Cloudflare-specific keys.
 * It is mounted as a volume in Cloud Run at /run/secrets/tomoribot-production.
 *
 * Update secretsManager.ts to read from the mounted file instead of AWS SDK.
 * New GCS-specific keys replace the S3 equivalents:
 *   AVATAR_GCS_BUCKET, AVATAR_PUBLIC_BASE_URL
 *   VOICE_SAMPLE_GCS_BUCKET, VOICE_SAMPLE_PUBLIC_BASE_URL, VOICE_SAMPLE_GCS_PREFIX
 */

resource "google_secret_manager_secret" "tomoribot" {
  secret_id = var.secret_name

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}
