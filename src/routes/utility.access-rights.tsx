import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/utility/access-rights")({
  beforeLoad: () => {
    throw redirect({
      to: "/utility/users/access-rights",
    });
  },
});
