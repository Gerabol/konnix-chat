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

    @Query("""
            select new br.gov.pb.cge.konnix.api.admin.dto.AuditOptionsResponse$UserOption(u.id, u.username, u.name)
            from User u
            order by lower(coalesce(u.name, u.username)) asc
            """)
    List<br.gov.pb.cge.konnix.api.admin.dto.AuditOptionsResponse.UserOption> findAuditUserOptions();

    long countByActiveTrueAndRoles_Name(String roleName);

    long countByAccountStatus(String accountStatus);

    @Query(value = """
            select u.theme, count(*) as users
            from users u
            group by u.theme
            order by users desc, u.theme asc
            """, nativeQuery = true)
    List<Object[]> countUsersByTheme();

    @Query(value = """
            select cast(u.id as varchar), u.username, u.name, u.email, u.presence_status, u.theme
            from users u
            where u.active = true
              and u.account_status = 'ACTIVE'
              and not exists (
                  select 1 from messages m
                  where m.user_id = u.id
                    and m.deleted_at is null
                    and m.created_at >= :from
              )
            order by lower(coalesce(u.name, u.username)) asc, lower(u.username) asc
            """, nativeQuery = true)
    List<Object[]> findActiveUsersAbsentSince(@Param("from") java.time.Instant from);

    List<User> findByActiveTrueAndRoles_Name(String roleName);

    @Modifying
    @Transactional
    @Query("update User u set u.presenceStatus = 'offline' where u.presenceStatus = 'online'")
    int markOnlineUsersOffline();
}
