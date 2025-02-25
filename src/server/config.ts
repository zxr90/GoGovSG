import nodemailer from 'nodemailer'
import { ConnectionOptions } from 'sequelize'
import winston, { createLogger, format, transports } from 'winston'
import minimatch from 'minimatch'
import { parse } from 'url'
import { parse as parseUri } from 'pg-connection-string'
import generateOTP, { OtpFunction } from './util/otp'

// Check environment
export const DEV_ENV: boolean = process.env.NODE_ENV === 'development'

// Constants for export
// For bcrypt hash
const SALT_ROUNDS: number = Number(process.env.SALT_ROUNDS) || 10
// in seconds, for OTP password expiry
const OTP_EXPIRY: number = Number(process.env.OTP_EXPIRY) || 5 * 60
// in seconds, for URL cache expiry
const REDIRECT_EXPIRY: number = Number(process.env.REDIRECT_EXPIRY) || 5 * 60
// in seconds, for statistics cache expiry
const STATISTICS_EXPIRY: number =
  Number(process.env.STATISTICS_EXPIRY) || 5 * 60

// Compulsory environment variables required for booting up
const requiredVars: string[] = [
  'DB_URI', // Main SQL database used with Sequelize
  'REPLICA_URI',
  'OG_URL', // Origin Url
  'REDIS_OTP_URI', // Cache for storing OTP hashes
  'REDIS_SESSION_URI', // Cache for storing session info
  'REDIS_REDIRECT_URI', // Cache for short links
  'REDIS_STAT_URI', // Cache for statistics (user, link, and click counts)
  'REDIS_SAFE_BROWSING_URI', // Cache for Safe Browsing threat matches
  'SESSION_SECRET',
  'VALID_EMAIL_GLOB_EXPRESSION', // Glob pattern for valid emails
  'AWS_S3_BUCKET', // For file.go.gov.sg uploads
]

// AWS Simple Email Service
const sesVars: string[] = ['SES_HOST', 'SES_USER', 'SES_PASS', 'SES_PORT']

// Winston for generic logging
export const logger: winston.Logger = createLogger({
  // change level if in dev environment versus production
  level: DEV_ENV ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.json(),
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.printf(
          (info: any) => `${info.timestamp} ${info.level}: ${info.message}`,
        ),
      ),
    }),
  ],
})

const exitIfAnyMissing = (vars: string[]) => {
  const err = vars.reduce((res, e) => {
    if (!process.env[e]) res.push(e)
    return res
  }, [] as string[])
  if (err.length > 0) {
    logger.error(
      `ERROR: Cannot deploy app. These environment variables are missing\t: ${err.join(
        ', ',
      )}`,
    )
    process.exit(1)
  }
}

// Exit if any required env var are missing
exitIfAnyMissing(requiredVars)

// From here, all required env variables will be casted to non-nullable strings.

const otpFunction: OtpFunction | null = generateOTP
let transporterOpts: nodemailer.TransporterOptions | null = null
let proxy: boolean = true
let cookieConfig = null
let otpLimit: number = 5

// Configure transporer options for nodemailer
// All session variables will now be casted to non-nullable strings
transporterOpts = {
  host: process.env.SES_HOST as string,
  port: process.env.SES_PORT as string,
  pool: true,
  maxMessages: 100,
  maxConnections: 20,
}

if (DEV_ENV) {
  // Only configure things particular to development here
  logger.warn('Deploying in development mode.')
  cookieConfig = {
    secure: false, // do not set domain for localhost
    maxAge: 1800000, // milliseconds = 30 min
  }
  proxy = false
  otpLimit = 10

  // Configure maildev specific options
  transporterOpts.ignoreTLS = true
} else {
  logger.info('Deploying in production mode.')

  const maxAge = Number(process.env.COOKIE_MAX_AGE)
  cookieConfig = {
    secure: true,
    maxAge: Number.isNaN(maxAge) ? 1800000 : maxAge,
  }
  exitIfAnyMissing(sesVars)

  // Confgiure SES specific options
  transporterOpts.auth = {
    user: process.env.SES_USER as string,
    pass: process.env.SES_PASS as string,
  }
}

export interface CookieSettings {
  secure: boolean
  maxAge: number
}

export interface SessionSettings {
  name: string
  secret: string
}

export const validEmailDomainGlobExpression = process.env
  .VALID_EMAIL_GLOB_EXPRESSION as string
export const emailValidator = new minimatch.Minimatch(
  validEmailDomainGlobExpression,
  {
    noext: false,
    noglobstar: true,
    nobrace: true,
    nonegate: true,
  },
)
export const loginMessage = process.env.LOGIN_MESSAGE
export const userMessage = process.env.USER_MESSAGE

export const userAnnouncement = {
  message: process.env.ANNOUNCEMENT_MESSAGE,
  title: process.env.ANNOUNCEMENT_TITLE,
  subtitle: process.env.ANNOUNCEMENT_SUBTITLE,
  url: process.env.ANNOUNCEMENT_URL,
  image: process.env.ANNOUNCEMENT_IMAGE,
}

export const s3Bucket = process.env.AWS_S3_BUCKET as string
export const linksToRotate = process.env.ROTATED_LINKS

const parseDbUri = (uri: string): ConnectionOptions => {
  const { host, user, password, database, port } = parseUri(uri)
  if (!(host && user && password && database && port)) {
    logger.error('Invalid master/replica credentials supplied.')
    process.exit(1)
  }
  return { host, username: user, password, database, port }
}

export const databaseUri = process.env.DB_URI as string
export const masterDatabaseCredentials = parseDbUri(databaseUri)
export const replicaUri = process.env.REPLICA_URI as string
export const replicaDatabaseCredentials = parseDbUri(replicaUri)
export const redisOtpUri = process.env.REDIS_OTP_URI as string
export const redisSessionUri = process.env.REDIS_SESSION_URI as string
export const redisRedirectUri = process.env.REDIS_REDIRECT_URI as string
export const redisStatUri = process.env.REDIS_STAT_URI as string
export const redisSafeBrowsingUri = process.env
  .REDIS_SAFE_BROWSING_URI as string
export const getOTP: OtpFunction = otpFunction
export const transporterOptions: nodemailer.TransporterOptions = transporterOpts
export const trustProxy: boolean = proxy
export const otpRateLimit: number = otpLimit
export const cookieSettings: CookieSettings = cookieConfig
export const cookieSessionMaxSizeBytes =
  Number(process.env.COOKIE_SESSION_MAX_SIZE_BYTES) || 2000
export const ogUrl = process.env.OG_URL as string
export const ogHostname = parse(ogUrl).hostname
export const gaTrackingId: string | undefined = process.env.GA_TRACKING_ID
export const saltRounds = SALT_ROUNDS
export const otpExpiry = OTP_EXPIRY
export const redirectExpiry = REDIRECT_EXPIRY
export const statisticsExpiry = STATISTICS_EXPIRY
export const sessionSettings: SessionSettings = {
  secret: process.env.SESSION_SECRET as string,
  name: 'gogovsg',
}

export const cspOnlyReportViolations =
  process.env.CSP_ONLY_REPORT_VIOLATIONS === 'true'
export const cspReportUri = process.env.CSP_REPORT_URI

export const safeBrowsingLogOnly = process.env.SAFE_BROWSING_LOG_ONLY === 'true'

export const cloudmersiveKey: string | undefined = process.env.CLOUDMERSIVE_KEY
export const safeBrowsingKey: string | undefined = process.env.SAFE_BROWSING_KEY

// LocalStack variables.
export const bucketEndpoint =
  process.env.BUCKET_ENDPOINT || 'http://localstack:4566'
export const accessEndpoint =
  process.env.ACCESS_ENDPOINT || 'http://localhost:4566'

export const dbPoolSize = Number(process.env.DB_POOL_SIZE) || 40

export const sentryDns: string | undefined = process.env.SENTRY_DNS

export const assetVariant: string = process.env.ASSET_VARIANT || 'gov'
export const displayHostname =
  assetVariant === 'gov' ? 'Go.gov.sg' : 'For.edu.sg'
