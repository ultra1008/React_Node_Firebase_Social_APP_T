import React, { useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";

// api service
import PostService from "../../services/PostService";

// context (global state)
import { ThemeContext } from "../../context/ThemeContext";
import UserContext from "../../context/UserContext";
import PostsContext from "../../context/PostsContext";

const LikeButton = ({ post }) => {
  // ******* start global state ******* //
  // theme context
  const { isLightTheme, light, dark } = useContext(ThemeContext);
  const theme = isLightTheme ? light : dark;

  // user context
  const { userData, setUserData } = useContext(UserContext);

  // posts context
  const { posts, setPostsData } = useContext(PostsContext);
  // ******* end global state ******* //

  // local state
  const [wasLiked, setLikeStatus] = useState(false);

  // history init
  const history = useHistory();
  
  useEffect(() => {
    if (userData.isAuth) {
      /**
       * when user logged in and open the app,
       * fill like button of all posts that user have liked them before
       */
      userData.user.likes.map((like) => {
        if (post.postId === like.postId) {
          setLikeStatus(true);
        }
      });
    } else {
      console.log("likeButton-useEffect-isAuth=false");
    }
  }, [userData.isAuth, post.postId]);

  const likePost = (isAuth) => {
    if (isAuth) {
      PostService.LikePost(post.postId, userData.token)
        .then((res) => {
          // update post in posts (in global state) array
          posts.map((pos, index) => {
            if (pos.postId === res.data.postId) {
              let newPosts = [...posts];
              newPosts[index] = res.data;
              setPostsData(newPosts);
            }
          });
          setLikeStatus(true);
          // update user likes (in global state) array
          let newLikes = userData.user.likes;
          newLikes.push({
            postId: post.postId,
            profilePicture: userData.user.credentials.profilePicture,
            userName: userData.user.credentials.userName,
          });
          setUserData({
            ...userData,
            user: {
              ...userData.user,
              likes: newLikes,
            },
          });
        })
        .catch((err) => {
          console.log(err);
        });
    } else {
      history.push("/login");
    }
  };

  const unlikePost = (isAuth) => {
    if (isAuth) {
      PostService.unlikePost(post.postId, userData.token)
        .then((res) => {
          // update post in posts (in global state) array
          posts.map((pos, index) => {
            if (pos.postId === res.data.postId) {
              let newPosts = [...posts];
              newPosts[index] = res.data;
              setPostsData(newPosts);
            }
          });
          setLikeStatus(false);
          // update user likes (in global state) array
          let newLikes = userData.user.likes.filter(
            (like) => like.postId !== post.postId
          );
          setUserData({
            ...userData,
            user: {
              ...userData.user,
              likes: newLikes,
            },
          });
        })
        .catch((err) => {
          console.log(err.response.data);
        });
    } else {
      history.push("/login");
    }
  };

  return (
    <div className='postCard__content__line4__like'>
      {wasLiked ? (
        <div
          className='like__box unlike'
          onClick={(event) => {
            event.stopPropagation();
            unlikePost(userData.isAuth);
          }}
        >
          <i
            className='fas fa-heart'
            style={{
              color: theme.error,
            }}
          ></i>
          <div
            className='like__background'
            style={{
              background: theme.errorBackground,
            }}
          ></div>
        </div>
      ) : (
        <div
          className='like__box like'
          onClick={(event) => {
            event.stopPropagation();
            likePost(userData.isAuth);
          }}
        >
          <i
            className='fal fa-heart'
            style={{
              color: theme.mobileNavIcon,
            }}
          ></i>
          <div
            className='like__background'
            style={{
              background: theme.errorBackground,
            }}
          ></div>
        </div>
      )}

      {post.likeCount === 0 ? "" : post.likeCount}
    </div>
  );
};

export default LikeButton;
