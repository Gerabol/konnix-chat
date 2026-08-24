package br.gov.pb.cge.konnix.domain.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "system_settings")
public class SystemSetting {
    @Id
    @Column(name = "setting_key", length = 120)
    private String key;

    @Column(name = "boolean_value", nullable = false)
    private boolean booleanValue;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public boolean isBooleanValue() { return booleanValue; }
    public void setBooleanValue(boolean booleanValue) { this.booleanValue = booleanValue; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
