package br.gov.pb.cge.konnix.domain.user;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsernameIgnoreCase(String username);

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    List<User> findAllByOrderByUsernameAsc();

    @Query("""
            select u from User u
            where u.active = true
              and (u.accountStatus is null or u.accountStatus <> 'DISABLED')
              and (:query is null or :query = ''
                   or lower(u.name) like lower(concat('%', :query, '%'))
                   or lower(u.username) like lower(concat('%', :query, '%'))
                   or lower(u.email) like lower(concat('%', :query, '%')))
            order by lower(coalesce(u.name, u.username)) asc, lower(u.username) asc
            """)
    List<User> searchDirectory(@Param("query") String query);

    @Query("""
            select u from User u
            where :query is null or :query = ''
               or lower(u.name) like lower(concat('%', :query, '%'))
               or lower(u.username) like lower(concat('%', :query, '%'))
               or lower(u.email) like lower(concat('%', :query, '%'))
            order by lower(u.username)
            """)
    Page<User> search(@Param("query") String query, Pageable pageable);

    long countByActiveTrueAndRoles_Name(String roleName);

    long countByAccountStatus(String accountStatus);

    List<User> findByActiveTrueAndRoles_Name(String roleName);

    @Modifying
    @Transactional
    @Query("update User u set u.presenceStatus = 'offline' where u.presenceStatus = 'online'")
    int markOnlineUsersOffline();
}
