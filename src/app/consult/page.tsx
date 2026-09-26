import { redirect } from 'next/navigation'

/**
 * The consult's old address. It now lives at `/quizv2`, behind the founder
 * sign-in; this keeps old links (and "Change my answers") working.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const review = (await searchParams).review
  redirect(review ? '/quizv2?review=1' : '/quizv2')
}
