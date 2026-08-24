package br.gov.pb.cge.konnix.domain.poll;

import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "poll_options")
public class PollOption {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "poll_id", nullable = false)
    private Poll poll;

    @Column(nullable = false, length = 255)
    private String label;

    @Column(nullable = false)
    private int position;

    public UUID getId() { return id; }
    public Poll getPoll() { return poll; }
    public void setPoll(Poll poll) { this.poll = poll; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
}
