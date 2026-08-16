import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  GalleryVerticalEndIcon,
  LogOutIcon,
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
  StethoscopeIcon,
  ClipboardListIcon,
  CalendarDaysIcon,
  UsersIcon,
  SettingsIcon,
  HistoryIcon,
  UserCircleIcon,
} from "lucide-react";

const data = {
  navMain: [
    {
      title: "Getting Started",
      url: "#",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard/admin",
          roles: ["admin"],
          icon: LayoutDashboardIcon,
        },
        {
          title: "Dashboard",
          url: "/dashboard/staff",
          roles: ["staff"],
          icon: LayoutDashboardIcon,
        },
        {
          title: "Dashboard",
          url: "/dashboard/patient",
          roles: ["patient"],
          icon: LayoutDashboardIcon,
        },
        {
          title: "Dentists",
          url: "/dentists",
          roles: ["admin"],
          icon: StethoscopeIcon,
        },
        {
          title: "Services",
          url: "/services",
          roles: ["admin"],
          icon: ClipboardListIcon,
        },
        {
          title: "Appointments",
          url: "/all-appointments",
          roles: ["admin"],
          icon: CalendarDaysIcon,
        },
        {
          title: "Appointments",
          url: "/appoinments-staff",
          roles: ["staff"],
          icon: CalendarDaysIcon,
        },
        {
          title: "Patients",
          url: "/patients",
          roles: ["admin", "staff"],
          icon: UsersIcon,
        },
        {
          title: "Settings",
          url: "/settings",
          roles: ["admin"],
          icon: SettingsIcon,
        },
        {
          title: "Appointments",
          url: "/appointments",
          roles: ["patient"],
          icon: CalendarDaysIcon,
        },
        {
          title: "History",
          url: "/history",
          roles: ["patient"],
          icon: HistoryIcon,
        },
        {
          title: "Profile",
          url: "/profile",
          roles: ["patient"],
          icon: UserCircleIcon,
        },
      ],
    },
  ],
};

/**
 * NOTE: swap "Carevia" / GalleryVerticalEndIcon for your real product
 * logo + name — these were placeholders in the original template.
 */

export function MobileHeader() {
  const { user, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
          <Avatar className="h-8 w-8 rounded-lg ring-2 ring-blue-100">
            <AvatarFallback className="rounded-lg bg-blue-600 text-white text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <ChevronsUpDownIcon className="h-4 w-4 text-slate-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-56">
          <DropdownMenuItem disabled className="capitalize">
            Role: {user?.role}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
          >
            <LogOutIcon className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const role = user?.role ?? null;

  const handleLogoutSafe = async () => {
    try {
      await handleLogout();
    } catch {
      navigate("/");
    }
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none [&_[data-slot=sidebar-container]]:bg-white [&_[data-slot=sidebar-container]]:shadow-sm"
      {...props}
    >
      <SidebarHeader className="px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/" />}
              className="hover:bg-blue-50"
            >
              <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                <GalleryVerticalEndIcon className="size-4.5" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-slate-900">Carevia</span>
                <span className="text-xs text-slate-500">v1.0.0</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {data.navMain.map((item) => {
              const visibleItems = item.items?.filter(
                (subItem) =>
                  !subItem.roles || (role && subItem.roles.includes(role)),
              );

              if (!visibleItems?.length) return null;

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to={item.url}
                        className="font-semibold text-slate-500"
                      />
                    }
                    className="cursor-default hover:bg-transparent text-xs uppercase tracking-wide"
                  >
                    {item.title}
                  </SidebarMenuButton>

                  <SidebarMenuSub className="ml-0 border-l-0 px-1 gap-0.5">
                    {visibleItems.map((subItem) => {
                      const isActive = location.pathname === subItem.url;
                      const Icon = subItem.icon;

                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            isActive={isActive}
                            render={<Link to={subItem.url} />}
                            className={
                              isActive
                                ? "bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-600 hover:text-white data-[active=true]:bg-blue-600 data-[active=true]:text-white"
                                : "text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                            }
                          >
                            <Icon
                              className={`size-4 shrink-0 ${
                                isActive ? "text-white" : "text-slate-500"
                              }`}
                            />
                            {subItem.title}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-blue-50 hover:bg-blue-50 rounded-xl"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg ring-2 ring-blue-100">
                  <AvatarFallback className="rounded-lg bg-blue-600 text-white text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none text-left min-w-0">
                  <span className="font-medium text-slate-900 truncate">
                    {user?.name}
                  </span>
                  <span className="text-xs text-slate-500 truncate">
                    {user?.email}
                  </span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 text-slate-500 shrink-0" />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl"
                side="top"
                align="end"
              >
                <DropdownMenuItem disabled className="capitalize">
                  Role: {user?.role}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogoutSafe}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <LogOutIcon className="mr-2 size-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
