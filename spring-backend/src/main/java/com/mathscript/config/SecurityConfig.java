package com.mathscript.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Spring Security config — stateless REST API.
 * Uses HMAC-signed session IDs (custom scheme), not Spring sessions.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // Disable CSRF — we use HMAC-signed session tokens
            .csrf(AbstractHttpConfigurer::disable)
            // Stateless — no HTTP sessions
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // All API endpoints and static files are public (auth is session-based, not Spring Security)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/stripe/webhook").permitAll() // webhook must be accessible
                .requestMatchers("/api/**").permitAll()
                .requestMatchers("/**").permitAll()
                .anyRequest().permitAll()
            )
            // Add security response headers
            .headers(headers -> headers
                .xssProtection(xss -> {})
                .contentTypeOptions(cto -> {})
                .frameOptions(fo -> fo.sameOrigin())
            );

        return http.build();
    }
}
