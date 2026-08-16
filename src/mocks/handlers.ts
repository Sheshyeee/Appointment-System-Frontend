import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("http://127.0.0.1:8000/api/ping", () => {
    return HttpResponse.json({ message: "yow" });
  }),
  http.get("http://127.0.0.1:8000/api/users/:id", ({ params }) => {
    return HttpResponse.json({
      id: Number(params.id),
      name: "Mock User",
      email: "mock@example.com",
    });
  }),
];
