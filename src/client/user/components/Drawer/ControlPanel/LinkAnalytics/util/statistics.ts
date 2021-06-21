import { useEffect, useState } from 'react'

import { useDispatch } from 'react-redux'
import * as Sentry from '@sentry/react'
import { get } from '../../../../../../app/util/requests'
import { LinkStatistics } from '../../../../../../../shared/interfaces/link-statistics'
import { GAEvent } from '../../../../../../app/util/ga'
import loginActions from '../../../../../../login/actions'

export type LinkStatisticsState = {
  status: number | null
  contents: LinkStatistics | null
}

export const initialState: LinkStatisticsState = {
  status: null,
  contents: null,
}

export const useStatistics = (shortUrl: string) => {
  const [statistics, setStatistics] =
    useState<LinkStatisticsState>(initialState)

  const dispatch = useDispatch()

  useEffect(() => {
    const fetchStatistics = async () => {
      const endpoint = `/api/link-stats?url=${shortUrl}`
      const response = await get(endpoint)

      if (response.status !== 200) {
        // Sentry analytics: fetching analytics fail
        Sentry.captureMessage(`fetching analytics data unsuccessful`)
        GAEvent(
          'drawer page analytics data',
          'fetch analytics data',
          'unsuccessful',
        )
      }

      if (response.status === 401) {
        dispatch(loginActions.handleExpiredSession())
      }

      const linkStatistics: LinkStatisticsState = {
        status: response.status,
        contents: await response.json(),
      }
      setStatistics(linkStatistics)
    }
    if (shortUrl) {
      fetchStatistics()
    }
  }, [])

  return statistics
}
