import { Minimatch } from 'minimatch'
import { Dispatch } from 'redux'
import { ThunkDispatch } from 'redux-thunk'
import validator from 'validator'
import * as Sentry from '@sentry/react'
import { GAEvent } from '../../app/util/ga'
import {
  EmailValidatorType,
  GET_OTP_EMAIL_ERROR,
  GET_OTP_EMAIL_PENDING,
  GET_OTP_EMAIL_SUCCESS,
  GetOtpEmailErrorAction,
  GetOtpEmailPendingAction,
  GetOtpEmailSuccessAction,
  IS_LOGGED_IN_SUCCESS,
  IS_LOGGED_OUT,
  IsLoggedInSuccessAction,
  IsLoggedOutAction,
  RESEND_OTP_DISABLED,
  RESEND_OTP_PENDING,
  ResendOtpDisabledAction,
  ResendOtpPendingAction,
  SET_EMAIL_VALIDATOR,
  SetEmailValidatorAction,
  VERIFY_OTP_ERROR,
  VERIFY_OTP_PENDING,
  VerifyOtpErrorAction,
  VerifyOtpPendingAction,
} from './types'
import { loginFormVariants } from '../../app/util/types'
import { get, postJson } from '../../app/util/requests'
import userActions from '../../user/actions'
import rootActions from '../../app/components/pages/RootPage/actions'
import { defaultEmailValidator } from '../reducers'
import { WipeUserStateAction } from '../../user/actions/types'
import { GetReduxState } from '../../app/actions/types'
import { GoGovReduxState } from '../../app/reducers/types'
import {
  CloseSnackbarAction,
  SetErrorMessageAction,
  SetSuccessMessageAction,
} from '../../app/components/pages/RootPage/actions/types'

const isGetOTPSuccess: (email: string) => GetOtpEmailSuccessAction = (
  email,
) => ({
  type: GET_OTP_EMAIL_SUCCESS,
  payload: email,
})

const isGetOTPPending: () => GetOtpEmailPendingAction = () => ({
  type: GET_OTP_EMAIL_PENDING,
})

const isGetOTPError: (errorMessage?: string) => GetOtpEmailErrorAction = (
  errorMessage,
) => ({
  type: GET_OTP_EMAIL_ERROR,
  payload: errorMessage,
})

const setEmailValidator: (
  payload: EmailValidatorType,
) => SetEmailValidatorAction = (payload) => ({
  type: SET_EMAIL_VALIDATOR,
  payload,
})

const isVerifyOTPError: () => VerifyOtpErrorAction = () => ({
  type: VERIFY_OTP_ERROR,
})

const isVerifyOTPPending: () => VerifyOtpPendingAction = () => ({
  type: VERIFY_OTP_PENDING,
})

const isResendOTPSuccess = isGetOTPSuccess

const isResendOTPPending: () => ResendOtpPendingAction = () => ({
  type: RESEND_OTP_PENDING,
})

const isResendOTPError = isVerifyOTPError

const isResendOTPDisabled: (errorMessage?: string) => ResendOtpDisabledAction =
  (errorMessage) => ({
    type: RESEND_OTP_DISABLED,
    payload: errorMessage,
  })

const isLoggedInSuccess: (user: { id: string }) => IsLoggedInSuccessAction = (
  user,
) => ({
  type: IS_LOGGED_IN_SUCCESS,
  payload: user,
})
const isLoggedOut: () => IsLoggedOutAction = () => ({ type: IS_LOGGED_OUT })

const getEmailValidationGlobExpression =
  () =>
  (dispatch: Dispatch<SetEmailValidatorAction>, getState: GetReduxState) => {
    const { login } = getState()
    const { emailValidator } = login
    if (emailValidator !== defaultEmailValidator) return
    get('/api/login/emaildomains').then((response) => {
      if (response.ok) {
        response.text().then((expression) => {
          const globValidator = new Minimatch(expression, {
            noext: false,
            noglobstar: true,
            nobrace: true,
            nonegate: true,
          })
          dispatch<SetEmailValidatorAction>(
            setEmailValidator((email: string) => {
              return (
                globValidator.match(email) &&
                validator.isEmail(email, { allow_utf8_local_part: false })
              )
            }),
          )
        })
      }
    })
  }

/**
 * Called when user enters email and waits for OTP.
 */
const getOTPEmail =
  (email: string) =>
  (
    dispatch: Dispatch<
      | GetOtpEmailErrorAction
      | CloseSnackbarAction
      | ResendOtpDisabledAction
      | GetOtpEmailSuccessAction
      | GetOtpEmailPendingAction
      | ResendOtpPendingAction
      | VerifyOtpErrorAction
      | SetErrorMessageAction
    >,
    getState: GetReduxState,
  ) => {
    dispatch<CloseSnackbarAction>(rootActions.closeSnackbar())

    const { login } = getState()
    const { formVariant } = login
    let pendingAction: () => void
    let successAction: () => void
    let errorAction: () => void

    const disableResendForDuration = (duration = 20000) => {
      dispatch<ResendOtpDisabledAction>(isResendOTPDisabled())
      // reenable after duration
      setTimeout(
        () => dispatch<GetOtpEmailSuccessAction>(isResendOTPSuccess(email)),
        duration,
      )
    }
    if (loginFormVariants.isEmailView(formVariant)) {
      pendingAction = () =>
        dispatch<GetOtpEmailPendingAction>(isGetOTPPending())
      successAction = () => {
        dispatch<GetOtpEmailSuccessAction>(isGetOTPSuccess(email))
        disableResendForDuration()
      }
      errorAction = () => dispatch<GetOtpEmailErrorAction>(isGetOTPError())
    } else {
      pendingAction = () =>
        dispatch<ResendOtpPendingAction>(isResendOTPPending())
      successAction = () => disableResendForDuration()
      errorAction = () => dispatch<VerifyOtpErrorAction>(isResendOTPError())
    }

    pendingAction()
    return postJson('/api/login/otp', { email })
      .then((response) => {
        if (response.ok) {
          successAction()
          return null
        }
        if (response.status === 401) {
          // Unauthorized
          errorAction()
          dispatch<SetErrorMessageAction>(
            rootActions.setErrorMessage(response.statusText),
          )
          return null
        }
        return response.json().then((json) => {
          const { message } = json
          errorAction()
          dispatch<SetErrorMessageAction>(rootActions.setErrorMessage(message))
        })
      })
      .catch(() => {
        errorAction()
        dispatch<SetErrorMessageAction>(
          rootActions.setErrorMessage('Network connectivity failed.'),
        )
        return null
      })
  }

// Checks if there is an existing session.
const isLoggedIn =
  () => (dispatch: Dispatch<IsLoggedInSuccessAction | IsLoggedOutAction>) =>
    get('/api/login/isLoggedIn').then((response) => {
      const isOk = response.ok
      return response.json().then((json) => {
        if (isOk) {
          const { user } = json
          dispatch<IsLoggedInSuccessAction>(isLoggedInSuccess(user))
        } else {
          dispatch<IsLoggedOutAction>(isLoggedOut())
        }
      })
    })

/**
 * Called when user enters OTP and submits for verification.
 */
const verifyOTP =
  (otp: string) =>
  (
    dispatch: ThunkDispatch<
      GoGovReduxState,
      void,
      | SetSuccessMessageAction
      | SetErrorMessageAction
      | VerifyOtpPendingAction
      | VerifyOtpErrorAction
      | CloseSnackbarAction
    >,
    getState: GetReduxState,
  ) => {
    dispatch<CloseSnackbarAction>(rootActions.closeSnackbar())

    const { login } = getState()
    const { email } = login

    dispatch<VerifyOtpPendingAction>(isVerifyOTPPending())
    return postJson('/api/login/verify', { email, otp }).then((response) => {
      const isOk = !!response.ok
      return response.json().then((json) => {
        if (isOk) {
          dispatch<SetSuccessMessageAction>(
            rootActions.setSuccessMessage('OTP Verified'),
          )
          dispatch<void>(isLoggedIn())
        } else {
          // Sentry analytics and Google Analytics: otp fail > sign in fails
          Sentry.captureMessage('submit otp unsuccessful')
          GAEvent('login page', 'otp', 'unsuccessful')

          const { message } = json
          dispatch<VerifyOtpErrorAction>(isVerifyOTPError())
          dispatch<SetErrorMessageAction>(rootActions.setErrorMessage(message))
        }
      })
    })
  }

const logout =
  () => (dispatch: Dispatch<IsLoggedOutAction | WipeUserStateAction>) =>
    get('/api/logout').then((response) => {
      if (response.ok) {
        dispatch<IsLoggedOutAction>(isLoggedOut())

        // Wipe user data on log out.
        dispatch<WipeUserStateAction>(userActions.wipeUserState())
      } else {
        console.error(response)
      }
    })

export default {
  getEmailValidationGlobExpression,
  getOTPEmail,
  verifyOTP,
  isLoggedIn,
  logout,
}
