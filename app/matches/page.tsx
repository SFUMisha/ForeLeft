"use client"

import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { MobileNav } from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { BREAKDOWN_LABELS, computeCompatibility, formatLabel } from "@/lib/matchmaking"
import type { CompatibilityBreakdownKey } from "@/lib/matchmaking"

type SpotlightBreakdownItem = {
  key: CompatibilityBreakdownKey
  value: number
}

export default function MatchesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [potentialMatches, setPotentialMatches] = useState<any[]>([])
  const [incomingRequests, setIncomingRequests] = useState<any[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([])
  const [acceptedMatches, setAcceptedMatches] = useState<any[]>([])
  const [allInterests, setAllInterests] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const sortedInterests = useMemo(() => Array.from(allInterests.values()).sort(), [allInterests])

  const selectedSkill = searchParams.get("skill") || "all"
  const selectedInterest = searchParams.get("interest") || "all"
  const selectedTab = searchParams.get("tab") || "discover"

  const pushWithParams = (params: URLSearchParams) => {
    const query = params.toString()
    router.push(query ? `/matches?${query}` : "/matches")
  }

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "discover") {
      params.delete("tab")
    } else {
      params.set("tab", value)
    }
    pushWithParams(params)
  }

  useEffect(() => {
    if (potentialMatches.length === 0) {
      setActiveIndex(0)
      return
    }

    if (activeIndex >= potentialMatches.length) {
      setActiveIndex(0)
    }
  }, [potentialMatches.length, activeIndex])

  const handlePass = () => {
    if (potentialMatches.length <= 1) {
      return
    }
    setActiveIndex((prev: number) => (prev + 1) % potentialMatches.length)
  }

  const activeMatch = potentialMatches[activeIndex]

  const otherMatches = useMemo(
    () => potentialMatches.filter((_: any, index: number) => index !== activeIndex),
    [potentialMatches, activeIndex],
  )

  const spotlightBreakdown = useMemo<SpotlightBreakdownItem[]>(() => {
    if (!activeMatch?.compatibility?.breakdown) {
      return []
    }

    return Object.entries(activeMatch.compatibility.breakdown)
      .map(([key, value]) => ({ key: key as CompatibilityBreakdownKey, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
  }, [activeMatch])

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      setCurrentUserId(user.id)

  const { data: currentProfileData } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      // Get potential matches (exclude current user)
      let matchesQuery = supabase
        .from("profiles")
        .select("*")
        .neq("id", user.id)
        .not("skill_level", "is", null)
        .order("trust_score", { ascending: false })

      if (selectedSkill !== "all") {
        matchesQuery = matchesQuery.eq("skill_level", selectedSkill)
      }

    const { data: matchesData } = await matchesQuery

      // Filter by interest if selected
      let filteredMatches = matchesData || []
      if (selectedInterest !== "all" && filteredMatches.length > 0) {
        filteredMatches = filteredMatches.filter((profile: any) => profile.interests?.includes(selectedInterest))
      }

      const enrichedMatches = filteredMatches.map((profile: any) => ({
        ...profile,
        compatibility: computeCompatibility(currentProfileData, profile),
      }))

      enrichedMatches.sort((a: any, b: any) => (b.compatibility?.score || 0) - (a.compatibility?.score || 0))

      setPotentialMatches(enrichedMatches)
      setActiveIndex(0)

      // Get all unique interests for filter
      const interests = new Set<string>()
      matchesData?.forEach((profile: any) => {
        profile.interests?.forEach((interest: string) => interests.add(interest))
      })
      setAllInterests(interests)

      // Get incoming match requests
      const { data: incomingData } = await supabase
        .from("matches")
        .select(`
          *,
          profiles!matches_requester_id_fkey (display_name, skill_level, avatar_url, interests, trust_score)
        `)
        .eq("matched_user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })

      setIncomingRequests(incomingData || [])

      // Get outgoing match requests
      const { data: outgoingData } = await supabase
        .from("matches")
        .select(`
          *,
          profiles!matches_matched_user_id_fkey (display_name, skill_level, avatar_url, interests, trust_score)
        `)
        .eq("requester_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })

      setOutgoingRequests(outgoingData || [])

      // Get accepted matches
      const { data: acceptedData } = await supabase
        .from("matches")
        .select(`
          *,
          requester:profiles!matches_requester_id_fkey (display_name, skill_level, avatar_url, interests),
          matched:profiles!matches_matched_user_id_fkey (display_name, skill_level, avatar_url, interests)
        `)
        .or(`requester_id.eq.${user.id},matched_user_id.eq.${user.id}`)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(10)

      setAcceptedMatches(acceptedData || [])

      setLoading(false)
    }

    loadData()
  }, [router, selectedSkill, selectedInterest])

  const handleSkillChange = (skill: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (skill === "all") {
      params.delete("skill")
    } else {
      params.set("skill", skill)
    }
    pushWithParams(params)
  }

  const handleInterestChange = (interest: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (interest === "all") {
      params.delete("interest")
    } else {
      params.set("interest", interest)
    }
    pushWithParams(params)
  }

  if (loading) {
    return (
      <div className="min-h-svh pb-20 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh pb-20 bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-balance">Find Partners</h1>
          <p className="text-muted-foreground">Connect with golfers who share your passion</p>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {incomingRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">
                  {incomingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
          </TabsList>

          {/* Discover Tab */}
          <TabsContent value="discover" className="space-y-6">
            {activeMatch ? (
              <Card>
                <CardHeader>
                  <CardTitle>Match Spotlight</CardTitle>
                  <CardDescription>We ranked golfers by how well they fit your vibe</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="w-20 h-20 rounded-full border-4 border-primary/40 flex items-center justify-center shrink-0">
                      <span className="text-2xl font-bold text-primary">{activeMatch.compatibility?.score ?? 0}%</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-xl font-semibold">{activeMatch.display_name}</h3>
                        <span className="text-sm font-medium text-primary">
                          {activeMatch.compatibility?.score ?? 0}% match
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="capitalize">{activeMatch.skill_level}</span>
                        {activeMatch.average_handicap && (
                          <>
                            <span>•</span>
                            <span>Handicap: {activeMatch.average_handicap.toFixed(1)}</span>
                          </>
                        )}
                        {activeMatch.pace_of_play && (
                          <>
                            <span>•</span>
                            <span>Pace: {formatLabel(activeMatch.pace_of_play)}</span>
                          </>
                        )}
                        {activeMatch.preferred_round_time && (
                          <>
                            <span>•</span>
                            <span>Tee time: {formatLabel(activeMatch.preferred_round_time)}</span>
                          </>
                        )}
                        {activeMatch.play_frequency && (
                          <>
                            <span>•</span>
                            <span>Plays: {formatLabel(activeMatch.play_frequency)}</span>
                          </>
                        )}
                      </div>
                      {activeMatch.match_goals && activeMatch.match_goals.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {activeMatch.match_goals.slice(0, 3).map((goal: string) => (
                            <span key={goal} className="px-2 py-1 rounded-md bg-primary/5 text-primary text-xs">
                              {formatLabel(goal)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {spotlightBreakdown.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {spotlightBreakdown.map((item: SpotlightBreakdownItem) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
                        >
                          <span className="text-muted-foreground">
                            {BREAKDOWN_LABELS[item.key] ?? formatLabel(item.key)}
                          </span>
                          <span className="font-semibold text-foreground">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="ghost"
                      className="sm:w-28"
                      onClick={handlePass}
                      disabled={potentialMatches.length <= 1}
                    >
                      Pass
                    </Button>
                    <Button asChild variant="outline" className="flex-1">
                      <Link href={`/matches/${activeMatch.id}`}>View Profile</Link>
                    </Button>
                    <Button asChild className="flex-1">
                      <Link href={`/matches/${activeMatch.id}/request`}>Connect</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  <p className="text-muted-foreground">We need a bit more info to find your golf crew.</p>
                  <p className="text-sm text-muted-foreground">
                    Try updating your profile preferences or broadening your filters.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Skill Level</label>
                  <select
                    value={selectedSkill}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background"
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleSkillChange(e.target.value)}
                  >
                    <option value="all">All Levels</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Interest</label>
                  <select
                    value={selectedInterest}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background"
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInterestChange(e.target.value)}
                  >
                    <option value="all">All Interests</option>
                    {sortedInterests.map((interest) => (
                      <option key={interest} value={interest}>
                        {formatLabel(interest)}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {otherMatches.length > 0 ? (
              <div className="space-y-4">
                {otherMatches.map((match: any) => (
                  <Card key={match.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {match.avatar_url ? (
                            <img
                              src={match.avatar_url || "/placeholder.svg"}
                              alt={match.display_name}
                              className="w-16 h-16 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-2xl font-bold text-primary">{match.display_name?.[0] || "?"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-lg">{match.display_name}</h3>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span className="capitalize">{match.skill_level}</span>
                                {match.average_handicap && (
                                  <>
                                    <span>•</span>
                                    <span>Handicap: {match.average_handicap.toFixed(1)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right text-sm font-medium text-primary">
                              {match.compatibility?.score ?? 0}% match
                            </div>
                          </div>
                          {match.bio && (
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{match.bio}</p>
                          )}
                          {match.interests && match.interests.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {match.interests.slice(0, 3).map((interest: string) => (
                                <span
                                  key={interest}
                                  className="px-2 py-1 rounded-md bg-secondary/10 text-secondary text-xs"
                                >
                                  {formatLabel(interest)}
                                </span>
                              ))}
                            </div>
                          )}
                          {match.match_goals && match.match_goals.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {match.match_goals.slice(0, 2).map((goal: string) => (
                                <span key={goal} className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">
                                  {formatLabel(goal)}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button asChild size="sm" className="flex-1">
                              <Link href={`/matches/${match.id}`}>View Profile</Link>
                            </Button>
                            <Button asChild size="sm" variant="outline" className="flex-1 bg-transparent">
                              <Link href={`/matches/${match.id}/request`}>Send Request</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : activeMatch ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  You&apos;ve seen your top match. Tap pass or adjust filters for new faces.
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Incoming Requests</CardTitle>
                <CardDescription>Players who want to match with you</CardDescription>
              </CardHeader>
              <CardContent>
                {incomingRequests.length > 0 ? (
                  <div className="space-y-3">
                    {incomingRequests.map((request: any) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            {request.profiles?.avatar_url ? (
                              <img
                                src={request.profiles.avatar_url || "/placeholder.svg"}
                                alt=""
                                className="w-12 h-12 rounded-full"
                              />
                            ) : (
                              <span className="text-lg font-bold text-primary">
                                {request.profiles?.display_name?.[0] || "?"}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{request.profiles?.display_name}</div>
                            <div className="text-sm text-muted-foreground capitalize">
                              {request.profiles?.skill_level}
                            </div>
                          </div>
                        </div>
                        <Button asChild size="sm">
                          <Link href={`/matches/requests/${request.id}`}>Review</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No incoming requests</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sent Requests</CardTitle>
                <CardDescription>Waiting for response</CardDescription>
              </CardHeader>
              <CardContent>
                {outgoingRequests.length > 0 ? (
                  <div className="space-y-3">
                    {outgoingRequests.map((request: any) => (
                      <div key={request.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            {request.profiles?.avatar_url ? (
                              <img
                                src={request.profiles.avatar_url || "/placeholder.svg"}
                                alt=""
                                className="w-12 h-12 rounded-full"
                              />
                            ) : (
                              <span className="text-lg font-bold text-primary">
                                {request.profiles?.display_name?.[0] || "?"}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{request.profiles?.display_name}</div>
                            <div className="text-sm text-muted-foreground">Pending</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No sent requests</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Matches Tab */}
          <TabsContent value="matches" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Matches</CardTitle>
                <CardDescription>Players you've connected with</CardDescription>
              </CardHeader>
              <CardContent>
                {acceptedMatches.length > 0 ? (
                  <div className="space-y-3">
                    {acceptedMatches.map((match: any) => {
                      const otherProfile = match.requester_id === currentUserId ? match.matched : match.requester
                      return (
                        <div
                          key={match.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              {otherProfile?.avatar_url ? (
                                <img
                                  src={otherProfile.avatar_url || "/placeholder.svg"}
                                  alt=""
                                  className="w-12 h-12 rounded-full"
                                />
                              ) : (
                                <span className="text-lg font-bold text-primary">
                                  {otherProfile?.display_name?.[0] || "?"}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{otherProfile?.display_name}</div>
                              <div className="text-sm text-muted-foreground capitalize">
                                {otherProfile?.skill_level}
                              </div>
                            </div>
                          </div>
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/matches/${match.requester_id === currentUserId ? match.matched_user_id : match.requester_id}`}
                            >
                              View
                            </Link>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No matches yet. Start connecting with other golfers!
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <MobileNav />
    </div>
  )
}
