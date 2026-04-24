import type { NewCategory } from "@desktop-tracker/shared";

/**
 * Seeded on first launch and refreshed for built-in rows during migrations.
 * Descriptions are also used as taxonomy hints for AI classification.
 */
export const DEFAULT_CATEGORIES: NewCategory[] = [
  {
    name: "Work",
    description:
      "Paid employment and professional output: employer calendar/email, work Slack/Teams, shipping code for your job, client deliverables, cloud/API consoles, and work meetings. NOT tutorials or study - that is Learning.",
    color: "#22c55e",
    weight: 1.0,
    isDefault: true,
    isHealthTracked: true,
    targetMinPerDay: 6 * 60,
    targetMinPerWeek: 30 * 60,
  },
  {
    name: "Religion",
    description:
      "Religious content, scripture or Quran/Bible reading, prayer apps, sermons, spiritual study, theology, devotional audio or video.",
    color: "#f59e0b",
    weight: 1.0,
    isDefault: true,
    isHealthTracked: true,
    targetMinPerDay: 30,
    targetMinPerWeek: 4 * 60,
  },
  {
    name: "Learning",
    description:
      "Software-engineering study: programming tutorials, docs, online courses, HackerRank/LeetCode/Stack Overflow, technical books, coding YouTube, and AI assistants used to learn, practice, or debug study/personal projects. NOT employer deliverables - that is Work.",
    color: "#0ea5e9",
    weight: 1.0,
    isDefault: true,
    isHealthTracked: true,
    targetMinPerDay: 3 * 60,
    targetMinPerWeek: 15 * 60,
  },
  {
    name: "Career",
    description:
      "Career growth and employability: job applications, resumes/CV, interview preparation, portfolio updates, professional networking, recruiter messages, LinkedIn used for job search, compensation research, and career planning. NOT general business content or casual social scrolling.",
    color: "#14b8a6",
    weight: 1.0,
    isDefault: true,
    isHealthTracked: true,
    targetMinPerDay: 60,
    targetMinPerWeek: 5 * 60,
  },
  {
    name: "Business",
    description:
      "Entrepreneurship, business/finance content, startup news, marketing, sales, personal finance, investing, and building or running a company. NOT movie trailers or casual vlogs.",
    color: "#8b5cf6",
    weight: 0.8,
    isDefault: true,
    isHealthTracked: true,
    targetMinPerDay: 30,
    targetMinPerWeek: 4 * 60,
  },
  {
    name: "Entertainment",
    description:
      "Movies, trailers, casual gaming videos, comedy, music videos, sports highlights, and anything purely for enjoyment.",
    color: "#f43f5e",
    weight: -0.3,
    isDefault: true,
    isHealthTracked: false,
    targetMinPerDay: null,
    targetMinPerWeek: null,
  },
  {
    name: "Social",
    description:
      "Social-media browsing, messaging with friends, casual scrolling on X/Twitter, Instagram, TikTok, Reddit threads not tied to learning or work.",
    color: "#ec4899",
    weight: -0.4,
    isDefault: true,
    isHealthTracked: false,
    targetMinPerDay: null,
    targetMinPerWeek: null,
  },
  {
    name: "System",
    description:
      "Operating-system UI, app chrome, screenshots, task switching, settings, tracker dashboard time, and short navigation states. Neutral utility time, not productive work.",
    color: "#64748b",
    weight: 0,
    isDefault: true,
    isHealthTracked: false,
    targetMinPerDay: null,
    targetMinPerWeek: null,
  },
  {
    name: "Unclassified",
    description:
      "Neutral activity that has not been confidently assigned yet: utilities, app chrome, brief lookups, and ambiguous activity.",
    color: "#94a3b8",
    weight: 0,
    isDefault: true,
    isHealthTracked: false,
    targetMinPerDay: null,
    targetMinPerWeek: null,
  },
];
