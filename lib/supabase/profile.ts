export type ProfileCompleteness = {
  first_name: string | null
  last_name: string | null
  phone: string | null
  province: string | null
}

/**
 * A profile is "complete" once name, phone, and province are all filled in.
 * Email/password signups always arrive complete (the signup form requires
 * these). Google signups never provide phone/province, so they
 * land here incomplete on purpose — see app/complete-profile.
 */
export function isProfileComplete(profile: ProfileCompleteness | null): boolean {
  if (!profile) return false
  return Boolean(profile.first_name && profile.last_name && profile.phone && profile.province)
}
