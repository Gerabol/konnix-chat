package br.gov.pb.cge.konnix.domain.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 60)
    private String username;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 254)
    private String email;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "account_status", nullable = false, length = 20)
    private String accountStatus = "ACTIVE";

    @Column(name = "user_type", nullable = false, length = 20)
    private String userType = "USER";

    @Column(name = "presence_status", nullable = false, length = 20)
    private String presenceStatus = "online";

    @Column(nullable = false, length = 20)
    private String theme = UserTheme.DEFAULT.name();

    @Column(name = "password_migration_required", nullable = false)
    private boolean passwordMigrationRequired = false;

    @Column(name = "password_change_required", nullable = false)
    private boolean passwordChangeRequired = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "legacy_source", length = 30)
    private String legacySource;

    @Column(name = "legacy_id", length = 255)
    private String legacyId;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
        this.accountStatus = active ? "ACTIVE" : "DISABLED";
    }

    public String getAccountStatus() {
        if (accountStatus == null || accountStatus.isBlank()) {
            return active ? "ACTIVE" : "DISABLED";
        }
        return accountStatus;
    }

    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
        this.active = !"DISABLED".equals(accountStatus);
    }

    public boolean isDisabled() {
        return !active || "DISABLED".equals(getAccountStatus());
    }

    public boolean isReadOnly() {
        return "READ_ONLY".equals(getAccountStatus());
    }

    public String getUserType() {
        return userType;
    }

    public void setUserType(String userType) {
        this.userType = userType;
    }

    public String getPresenceStatus() {
        return presenceStatus;
    }

    public void setPresenceStatus(String presenceStatus) {
        this.presenceStatus = presenceStatus;
    }

    public String getTheme() {
        return UserTheme.normalize(theme);
    }

    public void setTheme(String theme) {
        this.theme = UserTheme.normalize(theme);
    }

    public boolean isPasswordMigrationRequired() {
        return passwordMigrationRequired;
    }

    public void setPasswordMigrationRequired(boolean passwordMigrationRequired) {
        this.passwordMigrationRequired = passwordMigrationRequired;
    }

    public boolean isPasswordChangeRequired() {
        return passwordChangeRequired;
    }

    public void setPasswordChangeRequired(boolean passwordChangeRequired) {
        this.passwordChangeRequired = passwordChangeRequired;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getLegacySource() {
        return legacySource;
    }

    public void setLegacySource(String legacySource) {
        this.legacySource = legacySource;
    }

    public String getLegacyId() {
        return legacyId;
    }

    public void setLegacyId(String legacyId) {
        this.legacyId = legacyId;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public void setRoles(Set<Role> roles) {
        this.roles = roles;
    }
}
