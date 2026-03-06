module.exports = {
  apps: [
    {
      name: "meda-backend",
      cwd: "/root/meda/backend",
      script: "/root/meda/backend/.venv/bin/python",
      args: "manage.py runserver 0.0.0.0:7000",
      env: {
        DJANGO_SETTINGS_MODULE: "config.settings",
      },
      autorestart: true,
      max_restarts: 50,
    },
    {
      name: "meda-frontend",
      cwd: "/root/meda/frontend",
      script: "npm",
      args: "run dev -- --host 0.0.0.0 --port 5174",
      autorestart: true,
      max_restarts: 50,
    },
  ],
};
