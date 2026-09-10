import { z } from 'zod'
import { blank, url } from './profile'

/**
 * What the drafting reads and the template never draws.
 *
 * `Profile` holds the facts that appear on a resume and `ResumeDocument` holds
 * one arrangement of them. Neither has anywhere to put the two things a
 * tailored draft actually needs: the job being aimed at, and the raw material a
 * person has not turned into resume lines yet.
 *
 * They live apart from both for one reason that decides it — nothing here ever
 * reaches `buildRenderModel`. A pasted job advert is several thousand words,
 * and folding it into the profile would post it to `/api/compile` on every
 * keystroke for a template that would ignore it.
 *
 * The two are separate objects because they have different lifetimes. Notes are
 * about the person and outlive every application; a target is one job and is
 * replaced by the next.
 */

/** A long advert, well past what anyone pastes, and still a bounded request. */
export const MAX_POSTING = 20_000
/** Raw material. About 3,500 words, which is a lot of remembering. */
export const MAX_NOTES = 20_000
/** Voice is a description, not an essay. */
export const MAX_VOICE = 2_000

const bounded = (max: number) => blank.pipe(z.string().max(max).optional()).optional()

/**
 * The job being aimed at.
 *
 * Every field optional, like the profile, and for the same reason: this gets
 * filled in halfway through, from a page someone had open, and half of it is
 * worth more than none of it.
 */
export const jobTarget = z.object({
  company: bounded(120),
  role: bounded(160),
  url: url(),
  /** The advert itself, pasted. What tailoring is tailored to. */
  posting: bounded(MAX_POSTING),
})

/**
 * The material a resume is written from, rather than the resume.
 *
 * `notes` is everything not yet turned into a line: numbers, what a project
 * actually did, the thing that went wrong and got fixed. Drafting can only
 * phrase facts it has been given, so this is what decides whether a draft has
 * anything to say.
 *
 * `voice` is the part no resume contains — how someone writes, and what they
 * care about. A cover letter that sounds like a person needs a source for
 * sounding like that one, and it is not a work history.
 */
export const careerNotes = z.object({
  notes: bounded(MAX_NOTES),
  voice: bounded(MAX_VOICE),
  /**
   * Things to learn, put here by the fit report and kept off the resume.
   *
   * A gap somebody intends to close is worth writing down and is not worth
   * claiming. Keeping the two apart in the data is what stops "I will learn
   * this" from quietly becoming a line an employer reads.
   *
   * Long enough for a requirement as an advert words it. The first cap was 80
   * characters, which is shorter than "Experience designing agentic AI
   * architectures and AI-driven automation" — so adding one made the whole
   * profile fail validation on the next request, and the error said only that
   * the request did not match the expected shape.
   */
  learning: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
})

export type JobTarget = z.infer<typeof jobTarget>
export type CareerNotes = z.infer<typeof careerNotes>
