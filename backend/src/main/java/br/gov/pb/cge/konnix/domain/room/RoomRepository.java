package br.gov.pb.cge.konnix.domain.room;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoomRepository extends JpaRepository<Room, UUID> {

    boolean existsByName(String name);

    List<Room> findByTypeInOrderByNameAsc(List<String> types);

    long countByType(String type);
}
