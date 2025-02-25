import React, { FunctionComponent } from 'react'
import i18next from 'i18next'

import {
  Typography,
  createStyles,
  makeStyles,
  useMediaQuery,
  useTheme,
} from '@material-ui/core'
import emptyGraphic from '@assets/components/directory/empty-search-graphic/empty-graphic.svg'

const useStyles = makeStyles((theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      marginTop: theme.spacing(8),
      alignItems: 'center',
      [theme.breakpoints.up('md')]: {
        marginTop: theme.spacing(16),
      },
    },
    emptyStateGraphic: {
      marginTop: '48px',
      marginBottom: '76px',
      position: 'relative',
      zIndex: -1,
    },
    emptyStateBodyText: {
      marginTop: '8px',
      textAlign: 'center',
      padding: '10px',
    },
  }),
)

/**
 * @component Default display component in place of search result.
 */
const EmptyStateGraphic: FunctionComponent = () => {
  const classes = useStyles()
  const theme = useTheme()
  const isMobileView = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <div className={classes.root}>
      <Typography variant={isMobileView ? 'h5' : 'h3'}>
        What link are you looking for?
      </Typography>
      <Typography variant="body1" className={classes.emptyStateBodyText}>
        Search by keyword or email to see what links other{' '}
        {i18next.t('general.emailDomain')} officers <br />
        have created, and find link owners. The directory is only available{' '}
        <br />
        to users who are signed in.
      </Typography>
      <div className={classes.emptyStateGraphic}>
        <img src={emptyGraphic} alt="empty search graphic" />
      </div>
    </div>
  )
}

export default EmptyStateGraphic
