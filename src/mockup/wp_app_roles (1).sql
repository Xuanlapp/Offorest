-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Máy chủ: localhost
-- Thời gian đã tạo: Th4 07, 2026 lúc 04:24 PM
-- Phiên bản máy phục vụ: 10.5.28-MariaDB
-- Phiên bản PHP: 8.3.19

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Cơ sở dữ liệu: `h555762953_Offorest`
--

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `wp_app_roles`
--

CREATE TABLE `wp_app_roles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

--
-- Đang đổ dữ liệu cho bảng `wp_app_roles`
--

INSERT INTO `wp_app_roles` (`id`, `code`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
(4, 'Etsy', 'Etsy', 'Nhận viên Etsy', 1, '2026-04-04 14:51:07', '2026-04-04 14:51:07'),
(5, 'Amazon', 'Amazon', 'Nhận viên Amazon', 1, '2026-04-04 14:51:07', '2026-04-04 14:51:07');

--
-- Chỉ mục cho các bảng đã đổ
--

--
-- Chỉ mục cho bảng `wp_app_roles`
--
ALTER TABLE `wp_app_roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_role_code` (`code`);

--
-- AUTO_INCREMENT cho các bảng đã đổ
--

--
-- AUTO_INCREMENT cho bảng `wp_app_roles`
--
ALTER TABLE `wp_app_roles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
