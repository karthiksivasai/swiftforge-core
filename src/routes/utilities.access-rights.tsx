import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/utilities/access-rights")({
  beforeLoad: () => {
    throw redirect({
      to: "/utility/users/access-rights",
    });
  },
});
