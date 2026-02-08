"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ThemeBodyClass() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isLanding = pathname === "/";
    const isAdmin = pathname.startsWith("/admin");
    const useAppTheme = !isLanding && !isAdmin;
    document.body.classList.toggle("theme-app", useAppTheme);
    document.body.classList.toggle("theme-light", !useAppTheme);
  }, [pathname]);

  return null;
}
