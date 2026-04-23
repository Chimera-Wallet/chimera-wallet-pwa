import { useState, useEffect, useCallback } from 'react'
import { getValidAccessToken } from '../lib/kyc'
import { getReferralLink, getReferralReward, claimReferralReward } from '../providers/chimera'

export interface ReferralState {
  link: string | null
  rewardChf: number | null
  isLoading: boolean
  error: string | null
}

export function useReferral() {
  const [state, setState] = useState<ReferralState>({
    link: null,
    rewardChf: null,
    isLoading: true,
    error: null,
  })
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimSuccess, setClaimSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    const accessToken = await getValidAccessToken()
    if (!accessToken) {
      setState({ link: null, rewardChf: null, isLoading: false, error: 'Not authenticated' })
      return
    }
    try {
      const [linkRes, rewardRes] = await Promise.all([getReferralLink(accessToken), getReferralReward(accessToken)])
      setState({ link: linkRes.link, rewardChf: rewardRes.balance, isLoading: false, error: null })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load referral data',
      }))
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const claim = useCallback(
    async (address: string) => {
      setClaimError(null)
      setClaimSuccess(false)
      setClaiming(true)
      try {
        const accessToken = await getValidAccessToken()
        if (!accessToken) throw new Error('Not authenticated')
        await claimReferralReward(accessToken, address)
        setClaimSuccess(true)
        await fetchData()
      } catch (err) {
        setClaimError(err instanceof Error ? err.message : 'Failed to claim reward')
      } finally {
        setClaiming(false)
      }
    },
    [fetchData],
  )

  return { ...state, refetch: fetchData, claim, claiming, claimError, claimSuccess }
}
