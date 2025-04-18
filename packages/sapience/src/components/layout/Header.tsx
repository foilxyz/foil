'use client';

/* eslint-disable sonarjs/no-duplicate-string */
import { Button } from '@foil/ui/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from '@foil/ui/components/ui/sidebar';
import { ExternalLink, Menu } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';

import ConnectButton from './ConnectButton';
import ModeToggle from './ModeToggle';

// Dynamically import LottieIcon
const LottieIcon = dynamic(() => import('./LottieIcon'), {
  ssr: false,
  // Optional: Add a simple placeholder or skeleton
  loading: () => <div className="w-8 h-8 opacity-80" />,
});

const isActive = (path: string, pathname: string) => {
  if (path === '/') {
    return pathname === path;
  }
  return pathname.startsWith(path);
};

interface NavLinksProps {
  isMobile?: boolean;
  onClose?: () => void;
}

const NavLinks = ({
  isMobile: isMobileProp = false,
  onClose,
}: NavLinksProps) => {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const linkClass = isMobileProp
    ? 'text-xl font-medium justify-start rounded-full'
    : 'text-base font-medium justify-start rounded-full';
  const activeClass = 'bg-secondary';

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <nav className="flex flex-col gap-3 w-full my-48 ml-4">
      <Link href="/forecasting" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/forecasting', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Forecasting
        </Button>
      </Link>
      <Link href="/leaderboard" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/leaderboard', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Leaderboard
        </Button>
      </Link>
      <Link href="/bots" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/bots', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Use Bots
        </Button>
      </Link>
      <Link href="/futarchy" passHref className="flex w-fit">
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/futarchy', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          Futarchy
        </Button>
      </Link>
      <Link
        href="https://discord.gg/Hn2vzMDCSs"
        passHref
        className="flex w-fit"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button
          variant="ghost"
          className={`${linkClass} ${isActive('/community', pathname) ? activeClass : ''}`}
          onClick={handleLinkClick}
        >
          <span className="flex items-center">
            Community
            <ExternalLink className="h-4 w-4 ml-1.5 opacity-70" />
          </span>
        </Button>
      </Link>
    </nav>
  );
};

const Header = () => {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  return (
    <>
      {/* Top Header Bar */}
      <header className="w-full py-5 md:py-6 z-[50] fixed top-0 left-0">
        <div className="mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center bg-background/30 p-2 pr-4 md:pr-1 backdrop-blur-sm rounded-full">
            <Link href="/" className="inline-block">
              <div className="flex items-center gap-2">
                <LottieIcon
                  animationPath="/lottie/logomark.json"
                  width={32}
                  height={32}
                  className="opacity-80"
                />
                <span className="text-2xl font-normal">Sapience</span>
              </div>
            </Link>
            {/* Desktop Sidebar Trigger (inside header) */}
            <SidebarTrigger
              id="nav-sidebar"
              className="hidden md:flex items-center justify-center opacity-40 hover:opacity-90 ml-4 lg:ml-6"
            />
          </div>

          {/* Mobile Sidebar Trigger Button (fixed left, with border, hover effect) */}
          <SidebarTrigger
            id="nav-sidebar"
            className="fixed left-0 top-16 z-[51] flex items-center justify-center md:hidden border border-l-0 border-border bg-background/30 p-5 pl-4 backdrop-blur-sm rounded-r-full opacity-90 hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <Menu className="h-6 w-6" />
          </SidebarTrigger>

          <div className="flex items-center gap-5">
            <div className="block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
            <ConnectButton />
            {isConnected && address && (
              <Link href={`/profile/${address}`} passHref>
                <Button className="rounded-full px-8">Your Profile</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <Sidebar id="nav-sidebar" variant="sidebar" collapsible="offcanvas">
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
      </Sidebar>
    </>
  );
};

export default Header;
