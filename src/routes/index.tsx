import { createFileRoute } from "@tanstack/react-router";

import { LearningPortal } from "@/components/learning-portal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Student Learning Portal | IV Consulting" },
      {
        name: "description",
        content: "Access your IV Consulting learning modules, textbooks, videos, and podcasts.",
      },
      { property: "og:title", content: "IV Consulting Student Learning Portal" },
      {
        property: "og:description",
        content: "Sign in to access your IV Consulting learning modules and course materials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearningPortal,
});
