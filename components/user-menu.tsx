"use client";

// Header account control. Signed out: a "Login" button linking to /login.
// Signed in (admin): a dropdown with Account and Logout. The logout is a server
// action passed from the (server) header.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function UserIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function UserMenu({
  isLoggedIn,
  username,
  loginLabel,
  accountLabel,
  logoutLabel,
  logoutAction,
}: {
  isLoggedIn: boolean;
  username?: string | null;
  loginLabel: string;
  accountLabel: string;
  logoutLabel: string;
  logoutAction: () => Promise<void>;
}) {
  if (!isLoggedIn) {
    return (
      <Link href="/login">
        <Button variant="ghost" size="sm" className="gap-1.5" title={loginLabel}>
          <UserIcon />
          <span className="hidden sm:inline">{loginLabel}</span>
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" aria-label={username ?? loginLabel}>
          <UserIcon />
          <span className="hidden sm:inline max-w-[10rem] truncate">{username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {username && <DropdownMenuLabel>{username}</DropdownMenuLabel>}
        <DropdownMenuItem asChild>
          <Link href="/admin/account">{accountLabel}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logoutAction}>
            <button type="submit" className="w-full text-left">
              {logoutLabel}
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
