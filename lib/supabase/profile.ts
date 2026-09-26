export type ProfileCompleteness = {
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  province: string | null
  nationality: string | null
}

// Every select that feeds isProfileComplete() uses this, so adding a
// required field only ever means changing this file.
export const PROFILE_COMPLETENESS_COLUMNS = 'email, first_name, last_name, phone, province, nationality'

/**
 * A profile is "complete" once email, name, phone, province, and
 * nationality are all filled in. Email/password signups always arrive
 * complete (the signup form requires these). Google signups never provide
 * phone/province, and LINE signups usually provide no email either, so
 * they land here incomplete on purpose — see app/complete-profile. This
 * same gate also catches any existing account created before a field was
 * made required, regardless of how it originally signed up.
 */
export function isProfileComplete(profile: ProfileCompleteness | null): boolean {
  if (!profile) return false
  return Boolean(
    profile.email &&
      profile.first_name &&
      profile.last_name &&
      profile.phone &&
      profile.province &&
      profile.nationality,
  )
}
