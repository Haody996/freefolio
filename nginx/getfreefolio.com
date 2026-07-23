# freefolio — getfreefolio.com
# Install (run as root):
#   sudo cp nginx/getfreefolio.com /etc/nginx/sites-available/getfreefolio.com
#   sudo ln -s /etc/nginx/sites-available/getfreefolio.com /etc/nginx/sites-enabled/
#   sudo nginx -t && sudo systemctl reload nginx
#   sudo certbot --nginx -d getfreefolio.com -d www.getfreefolio.com
# (certbot rewrites this file to add the :443 TLS block and an HTTP→HTTPS redirect.)

server {
    listen 80;
    server_name getfreefolio.com www.getfreefolio.com;

    # Proxy everything to the freefolio Docker app container on host port 8090
    location / {
        proxy_pass         http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        client_max_body_size 10M;
    }
}
