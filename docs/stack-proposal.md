# Stack and deployment proposal

## Recommended initial stack

- **Astro + TypeScript** for the frontend.
- **shadcn/ui-style local components** for accessible, composable primitives that remain owned by the project.
- **Tailwind CSS** with semantic CSS variables and a Gruvbox-inspired palette.
- **Small client-side islands** only where the monitoring form and charts need interactivity.
- **Native browser fetch against an API contract**, never direct database access from the browser.
- **Static output first** while the API is external. This keeps the frontend deployable to Vercel and to a VPS behind Nginx.

Astro is a good fit because the first product is a data-entry and reporting interface, not a server-heavy application. If the project later needs authenticated server-rendered pages or Astro API routes, the output mode can move to Node SSR without changing the domain model.

## Docker setup

The first implementation slice now includes:

1. A multi-stage Node build image.
2. An Nginx runtime image serving the generated static site.
3. A health-friendly container port and documented environment variables for the API base URL.
4. A local `docker compose` workflow for frontend development/preview.

This is portable to a VPS and remains compatible with Vercel's static deployment. If the frontend becomes SSR-dependent, use Astro's Node adapter and a Node runtime image instead of adding database logic to the frontend container.

## What is deliberately not chosen yet

- No direct database driver in the browser.
- No large component library beyond the small local shadcn-style primitives used by the form.
- No framework-specific backend until the API boundary, authentication, and hosting responsibility are known.
- No import of the legacy workbooks into production data until the quality issues are resolved.
