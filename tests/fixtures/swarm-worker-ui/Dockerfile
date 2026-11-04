FROM docker:27-dind
COPY .packages/*.apk /tmp/ssh-packages/
RUN apk add --no-network /tmp/ssh-packages/*.apk && rm -rf /tmp/ssh-packages && passwd -d root \
    && printf '\nPermitRootLogin prohibit-password\nPasswordAuthentication no\nAllowTcpForwarding yes\n' >> /etc/ssh/sshd_config
COPY entrypoint.sh /usr/local/bin/lab-entrypoint
ENTRYPOINT ["lab-entrypoint"]
