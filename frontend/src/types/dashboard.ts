export type AdminDashboardData = {
  stats: Array<{ label: string; value: string | number; change: string }>;
  revenueTrend: Array<{ month: string; value: number }>;
  recentActivity: Array<{ id: string; action: string; actor: string; time: string }>;
  quickActions: Array<{ id: string; label: string }>;
};

export type StaffDashboardData = {
  welcomeTitle: string;
  summary: Array<{ label: string; value: string | number }>;
  notes: string[];
};

