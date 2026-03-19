package com.mathscript;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MathscriptApplication {
    public static void main(String[] args) {
        SpringApplication.run(MathscriptApplication.class, args);
    }
}
