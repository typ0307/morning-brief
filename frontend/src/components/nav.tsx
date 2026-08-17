"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/", label: "브리핑" },
  { href: "/keywords", label: "키워드" },
  { href: "/settings", label: "설정" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <span className="mr-3 text-lg font-bold">모닝브리프</span>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={signOut}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          로그아웃
        </button>
      </nav>
    </header>
  );
}
