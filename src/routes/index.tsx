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
    ],
  }),
  component: LearningPortal,
});
