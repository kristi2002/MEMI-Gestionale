import { Menu, Search, Bell, HelpCircle, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { initials } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { me } = useAuth();
  const { theme, toggle } = useTheme();
  const name = me?.nome || 'Admin';
  const email = me?.email || '';

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Menu">
        <Menu />
      </Button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cerca prodotti, ordini, clienti…" className="border-transparent bg-muted pl-9" />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Tema">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Aiuto">
          <HelpCircle />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifiche">
          <Bell />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium text-foreground">{name}</div>
              {email && <div className="text-xs font-normal text-muted-foreground">{email}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
              <LogOut />
              Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
