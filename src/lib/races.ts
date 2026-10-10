import { activateCourse, activeRace, type CourseData } from "@/lib/course";

export type RaceChoice = { id: string; course?: CourseData };

export function isFetchedCourse(course: CourseData | undefined | null): course is CourseData {
  return Boolean(
    course &&
      course.ele.length > 10 &&
      course.lat.length === course.ele.length &&
      course.lon.length === course.ele.length &&
      course.aidStations.length > 0,
  );
}

/** The course attached to a looked-up race. A saved id alone is not a route. */
export function courseFor(choice: RaceChoice | null | undefined): CourseData | null {
  if (!choice || !isFetchedCourse(choice.course)) return null;
  return choice.course;
}

export function bindRace(choice: RaceChoice | null) {
  const data = courseFor(choice);
  if (data && choice) activateCourse(data, choice);
  return data;
}

export function ensureCoachCourse(choice?: RaceChoice | null) {
  if (!choice?.id) return;
  const data = courseFor(choice);
  if (data) activateCourse(data, choice);
}

export function coachRace(): RaceChoice | null {
  const race = activeRace();
  if (!race || typeof race.id !== "string") return null;
  return race as RaceChoice;
}
