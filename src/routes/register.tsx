import { createFileRoute } from "@tanstack/react-router";

import { StudentRegistrationPage } from "@/components/learning-portal";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Student Registration | IV Consulting" },
      {
        name: "description",
        content:
          "Complete your IV Consulting NQF4 QCTO registration and securely upload supporting documents.",
      },
    ],
  }),
  component: StudentRegistrationPage,
});
